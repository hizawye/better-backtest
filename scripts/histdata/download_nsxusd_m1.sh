#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_ROOT="${ROOT_DIR}/data/histdata/nsxusd"
RAW_ZIPS_DIR="${DATA_ROOT}/raw-zips"
PAGES_DIR="${DATA_ROOT}/pages"
REPORT_FILE="${RAW_ZIPS_DIR}/download-report.json"
INDEX_URL="https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/NSXUSD"
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
COOKIE_JAR="$(mktemp)"

mkdir -p "${RAW_ZIPS_DIR}" "${PAGES_DIR}"

cleanup() {
  rm -f "${COOKIE_JAR}"
}
trap cleanup EXIT

extract_input_value() {
  local file="$1"
  local input_name="$2"

  rg -o "name=\"${input_name}\" id=\"${input_name}\" value=\"[^\"]+\"" "${file}" \
    | head -n1 \
    | sed -E 's/.*value="([^"]+)"/\1/'
}

echo "Fetching NSXUSD period index..."
index_file="${PAGES_DIR}/index.html"
curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" -A "${USER_AGENT}" "${INDEX_URL}" -o "${index_file}"

mapfile -t periods < <(
  rg -o '/ascii/1-minute-bar-quotes/nsxusd/[0-9]{4}(/[0-9]{1,2})?' "${index_file}" \
    | sed -E 's#.*/nsxusd/##' \
    | sort -uV
)

if [ "${#periods[@]}" -eq 0 ]; then
  echo "No NSXUSD periods found on HistData index page."
  exit 1
fi

echo "Discovered ${#periods[@]} periods."

{
  echo "{"
  echo "  \"generated_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"instrument\": \"NSXUSD\","
  echo "  \"timeframe\": \"M1\","
  echo "  \"entries\": ["
} > "${REPORT_FILE}"

entry_index=0
for period in "${periods[@]}"; do
  endpoint_url="https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/nsxusd/${period}"
  period_file="${PAGES_DIR}/period-${period//\//-}.html"

  echo "Processing ${period}..."
  curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" -A "${USER_AGENT}" "${endpoint_url}" -o "${period_file}"

  tk="$(extract_input_value "${period_file}" "tk")"
  date_val="$(extract_input_value "${period_file}" "date")"
  datemonth_val="$(extract_input_value "${period_file}" "datemonth")"
  platform_val="$(extract_input_value "${period_file}" "platform")"
  timeframe_val="$(extract_input_value "${period_file}" "timeframe")"
  fxpair_val="$(extract_input_value "${period_file}" "fxpair")"
  zip_name="$(rg -o 'HISTDATA_COM_ASCII_NSXUSD_M1_[0-9]{4,6}\.zip' "${period_file}" | head -n1 || true)"

  if [ -z "${tk}" ] || [ -z "${date_val}" ] || [ -z "${datemonth_val}" ] || [ -z "${platform_val}" ] || [ -z "${timeframe_val}" ] || [ -z "${fxpair_val}" ]; then
    echo "Failed to parse form fields for ${period}"
    status="failed_parse"
    file_size=0
    zip_name="${zip_name:-unknown}"
  else
    if [ -z "${zip_name}" ]; then
      zip_name="HISTDATA_COM_ASCII_NSXUSD_M1_${datemonth_val}.zip"
    fi

    zip_path="${RAW_ZIPS_DIR}/${zip_name}"

    if [ -s "${zip_path}" ]; then
      echo "  - already downloaded: ${zip_name}"
      status="skipped_existing"
      file_size="$(wc -c < "${zip_path}")"
    else
      tmp_zip="$(mktemp)"
      status="downloaded"

      success=0
      for attempt in 1 2 3; do
        if curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" -A "${USER_AGENT}" -e "${endpoint_url}" \
          -o "${tmp_zip}" -X POST "https://www.histdata.com/get.php" \
          --data "tk=${tk}&date=${date_val}&datemonth=${datemonth_val}&platform=${platform_val}&timeframe=${timeframe_val}&fxpair=${fxpair_val}"; then
          if [ -s "${tmp_zip}" ] && unzip -tqq "${tmp_zip}" >/dev/null 2>&1; then
            mv "${tmp_zip}" "${zip_path}"
            success=1
            break
          fi
        fi
        sleep $((attempt * 2))
      done

      if [ "${success}" -eq 1 ]; then
        file_size="$(wc -c < "${zip_path}")"
      else
        rm -f "${tmp_zip}"
        status="failed_download"
        file_size=0
      fi
    fi
  fi

  if [ "${entry_index}" -gt 0 ]; then
    echo "," >> "${REPORT_FILE}"
  fi

  printf '    {"period":"%s","status":"%s","zip":"%s","size_bytes":%s}' \
    "${period}" "${status}" "${zip_name}" "${file_size}" >> "${REPORT_FILE}"
  entry_index=$((entry_index + 1))
done

{
  echo ""
  echo "  ]"
  echo "}"
} >> "${REPORT_FILE}"

echo "Download report: ${REPORT_FILE}"
