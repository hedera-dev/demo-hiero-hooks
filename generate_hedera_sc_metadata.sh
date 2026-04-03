#!/usr/bin/env bash
set -euo pipefail

# generate_hedera_sc_metadata.sh
#
# A universal script to generate inline metadata.json bundles for HashScan/Sourcify verification.
# Supports both Hardhat and Foundry projects automatically.
#
# USAGE:
#   ./generate_hedera_sc_metadata.sh [ContractName] [ContractName=0xAddress] ...
#
# EXAMPLES:
#   ./generate_hedera_sc_metadata.sh MyToken
#   ./generate_hedera_sc_metadata.sh MyToken=0x1234567890abcdef...
#   ./generate_hedera_sc_metadata.sh src/MyContract.sol:MyContract=0x9876...
#   ./generate_hedera_sc_metadata.sh Contract1 Contract2

OUT_BASE="verify-bundles"
MANIFEST="$OUT_BASE/MANIFEST.txt"

die() { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }
need jq

# Detect framework
IS_HARDHAT=false
IS_FOUNDRY=false
IS_STANDALONE=false

if [ -f "hardhat.config.js" ] || [ -f "hardhat.config.ts" ]; then
  IS_HARDHAT=true
elif [ -f "foundry.toml" ]; then
  IS_FOUNDRY=true
else
  IS_STANDALONE=true
fi

to_upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

# --- RESOLVER UTILS ---

resolve_local_source() {
  local key="$1"
  local cand

  if [[ "$key" == npm/* ]]; then
    local rest="${key#npm/}"
    if [[ "$rest" == @* ]]; then
      local scope; scope="$(cut -d/ -f1 <<<"$rest")"
      local pkg_ver; pkg_ver="$(cut -d/ -f2 <<<"$rest")"
      local path; path="$(cut -d/ -f3- <<<"$rest")"
      local pkg="${pkg_ver%@*}"
      cand="node_modules/$scope/$pkg/$path"
    else
      local pkg_ver; pkg_ver="$(cut -d/ -f1 <<<"$rest")"
      local path; path="$(cut -d/ -f2- <<<"$rest")"
      local pkg="${pkg_ver%@*}"
      cand="node_modules/$pkg/$path"
    fi
    [ -f "$cand" ] && { echo "$cand"; return 0; }
  fi

  if [ -f "$key" ]; then echo "$key"; return 0; fi

  for root in contracts src lib node_modules; do
    cand="$root/$key"
    [ -f "$cand" ] && { echo "$cand"; return 0; }
  done

  if [[ "$key" == */contracts/* ]]; then
    cand="contracts/${key#*/contracts/}"
    [ -f "$cand" ] && { echo "$cand"; return 0; }
  fi
  if [[ "$key" == */src/* ]]; then
    cand="src/${key#*/src/}"
    [ -f "$cand" ] && { echo "$cand"; return 0; }
  fi

  if [ "$IS_FOUNDRY" = true ]; then
    if [ -z "${__REMAPPINGS:-}" ]; then
      __REMAPPINGS=$(forge remappings 2>/dev/null || true)
    fi
    if [ -n "$__REMAPPINGS" ]; then
      while IFS= read -r line; do
        local from="${line%%=*}"
        local to="${line#*=}"
        if [[ "$key" == "$from"* ]]; then
           local remainder="${key#$from}"
           cand="$to$remainder"
           [ -f "$cand" ] && { echo "$cand"; return 0; }
        fi
      done <<< "$__REMAPPINGS"
    fi
  fi

  local basename
  basename=$(basename "$key")
  cand=$(find . -type f -name "$basename" -not -path "*/node_modules/*" -not -path "*/artifacts/*" -not -path "*/out/*" | head -n 1)
  if [ -n "$cand" ] && [ -f "$cand" ]; then echo "$cand"; return 0; fi

  return 1
}

# --- HARDHAT STRATEGY ---

get_metadata_hardhat() {
  local name="$1"
  local ARTIFACTS_DIR="artifacts"
  local BUILD_INFO_DIR="artifacts/build-info"

  if [ ! -d "$ARTIFACTS_DIR" ]; then
    die "Hardhat artifacts not found. Run: npx hardhat compile"
  fi

  local dbg_file
  dbg_file="$(find "$ARTIFACTS_DIR" -type f -name "${name}.dbg.json" -print -quit)"

  if [ -n "$dbg_file" ]; then
    local bi_hash
    bi_hash="$(jq -r '.buildInfo.id // empty' "$dbg_file" 2>/dev/null || true)"
    if [ -n "$bi_hash" ]; then
      local candidate="$BUILD_INFO_DIR/${bi_hash}.json"
      if [ -f "$candidate" ]; then
        jq -r --arg n "$name" '
          [ (.output.contracts // .contracts) | to_entries[] | .value[$n].metadata // empty ] | first
        ' "$candidate"
        return 0
      fi
    fi
  fi

  local candidates
  candidates="$(grep -l "\"$name\"" "$BUILD_INFO_DIR"/*.json 2>/dev/null || true)"
  for f in $candidates; do
    if jq -e --arg n "$name" '
      (.output.contracts // .contracts) | to_entries | any(.value | has($n))
    ' "$f" >/dev/null 2>&1; then
       jq -r --arg n "$name" '
          [ (.output.contracts // .contracts) | to_entries[] | .value[$n].metadata // empty ] | first
        ' "$f"
       return 0
    fi
  done

  return 1
}

# --- FOUNDRY STRATEGY ---

get_metadata_foundry() {
  local name="$1"
  need forge

  if echo "Testing" | forge inspect "$name" metadata >/dev/null 2>&1; then
     forge inspect "$name" metadata
     return 0
  fi

  local candidate
  candidate="$(find out -name "${name}.json" -print -quit)"
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    local meta
    meta="$(jq -r '.metadata // empty' "$candidate")"
    if [ -n "$meta" ] && [ "$meta" != "null" ]; then
       echo "$meta"
       return 0
    fi
  fi

  return 1
}

# --- STANDALONE (solcjs) STRATEGY ---
#
# Looks for a pre-generated <ContractName>.metadata.json alongside the .sol file.
# If not found, attempts to regenerate it via solcjs --standard-json.
# The metadata.json must have been generated with the same compiler settings used
# for deployment (optimizer: true, runs: 200) to produce a matching bytecode hash.

get_metadata_standalone() {
  local name="$1"

  # Look for pre-generated metadata in common locations (build output, alongside .sol, project root)
  local meta_file
  meta_file="$(find . -name "${name}.metadata.json" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -n 1)"

  if [ -n "$meta_file" ] && [ -f "$meta_file" ]; then
    cat "$meta_file"
    return 0
  fi

  # Fallback: locate the .sol file anywhere in the project and regenerate via solcjs --standard-json
  local sol_file
  sol_file="$(find . -name "${name}.sol" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -n 1)"
  if [ -z "$sol_file" ]; then
    echo "  ! Could not find ${name}.sol" >&2
    return 1
  fi

  # Determine solcjs path
  local solcjs_bin="solcjs"
  if [ -x "/opt/homebrew/bin/solcjs" ]; then
    solcjs_bin="/opt/homebrew/bin/solcjs"
  elif [ -x "$(npm root -g)/solc/solcjs" ]; then
    solcjs_bin="$(npm root -g)/solc/solcjs"
  elif ! command -v solcjs >/dev/null 2>&1; then
    echo "  ! solcjs not found. Install with: npm install -g solc" >&2
    return 1
  fi

  echo "  Regenerating metadata via solcjs for ${sol_file}..." >&2

  local source
  source=$(cat "$sol_file")
  local input
  input=$(python3 -c "
import json, sys
source = open('${sol_file}').read()
print(json.dumps({
    'language': 'Solidity',
    'sources': {'${sol_file}': {'content': source}},
    'settings': {
        'optimizer': {'enabled': True, 'runs': 200},
        'outputSelection': {'*': {'*': ['metadata']}}
    }
}))")

  local output
  output=$(echo "$input" | "$solcjs_bin" --standard-json 2>/dev/null)

  # solcjs may prepend a warning line starting with ">>>"
  if echo "$output" | head -n1 | grep -q "^>>>"; then
    output=$(echo "$output" | tail -n +2)
  fi

  local meta_str
  meta_str=$(echo "$output" | python3 -c "
import json, sys
out = json.load(sys.stdin)
contracts = out.get('contracts', {})
# Find the contract by name across all source files
for src, src_contracts in contracts.items():
    if '${name}' in src_contracts:
        print(src_contracts['${name}'].get('metadata', ''))
        break
" 2>/dev/null || true)

  if [ -z "$meta_str" ]; then
    echo "  ! Could not extract metadata from solcjs output for ${name}" >&2
    return 1
  fi

  echo "$meta_str"
  return 0
}

# --- MAIN EXECUTION ---

mkdir -p "$OUT_BASE"

echo "HashScan Verify Upload Guide" > "$MANIFEST"
echo "============================" >> "$MANIFEST"
if $IS_HARDHAT; then
  echo "Detected System: Hardhat" >> "$MANIFEST"
elif $IS_FOUNDRY; then
  echo "Detected System: Foundry" >> "$MANIFEST"
else
  echo "Detected System: Standalone (solcjs)" >> "$MANIFEST"
fi
echo "" >> "$MANIFEST"

echo "== Generating Metadata Bundles ($(if $IS_HARDHAT; then echo "Hardhat"; elif $IS_FOUNDRY; then echo "Foundry"; else echo "Standalone/solcjs"; fi)) =="

if [ $# -eq 0 ]; then
  echo "Usage: $0 [ContractName] [ContractName=0xAddress] ..."
  exit 1
fi

for CONTRACT_ARG in "$@"; do
  if [[ "$CONTRACT_ARG" == *"="* ]]; then
     CONTRACT_INPUT="${CONTRACT_ARG%%=*}"
     EXPLICIT_ADDR="${CONTRACT_ARG#*=}"
  else
     CONTRACT_INPUT="$CONTRACT_ARG"
     EXPLICIT_ADDR=""
  fi

  CONTRACT_SAFE_NAME=$(basename "${CONTRACT_INPUT%%:*}" .sol)
  if [[ "$CONTRACT_INPUT" == *:* ]]; then
    CONTRACT_SAFE_NAME="${CONTRACT_INPUT##*:}"
  fi

  echo ""
  echo "Processing: $CONTRACT_INPUT"

  META_JSON=""

  if [ "$IS_HARDHAT" = true ]; then
    META_JSON="$(get_metadata_hardhat "$CONTRACT_INPUT")"
  elif [ "$IS_FOUNDRY" = true ]; then
    META_JSON="$(get_metadata_foundry "$CONTRACT_INPUT")"
  else
    META_JSON="$(get_metadata_standalone "$CONTRACT_INPUT")"
  fi

  if [ -z "$META_JSON" ] || [ "$META_JSON" = "null" ]; then
    echo "  ! FAIL: Metadata not found for '$CONTRACT_INPUT'."
    echo "    Ensure the contract is compiled and src/contracts/${CONTRACT_SAFE_NAME}.metadata.json exists."
    echo "    To regenerate: run this script (it will invoke solcjs automatically)."
    continue
  fi

  CONTRACT_DIR="$OUT_BASE/$CONTRACT_SAFE_NAME"
  mkdir -p "$CONTRACT_DIR"
  OUT_FILE="$CONTRACT_DIR/metadata.json"

  echo "$META_JSON" | jq . > "$OUT_FILE"

  echo "  Inlining source code..."
  SOURCE_KEYS="$(jq -r '.sources | keys[]' "$OUT_FILE")"
  MISSING_COUNT=0

  while IFS= read -r key; do
    [ -z "$key" ] && continue

    if [ "$(jq -r --arg k "$key" '(.sources[$k].content != null)' "$OUT_FILE")" = "true" ]; then
        tmp=$(mktemp)
        jq --arg k "$key" '(.sources[$k] |= del(.urls))' "$OUT_FILE" > "$tmp" && mv "$tmp" "$OUT_FILE"
        continue
    fi

    if local_path="$(resolve_local_source "$key")"; then
      tmp=$(mktemp)
      jq --arg k "$key" --rawfile c "$local_path" '(.sources[$k].content = $c) | (.sources[$k] |= del(.urls))' "$OUT_FILE" > "$tmp" && mv "$tmp" "$OUT_FILE"
    else
      echo "    ! WARNING: Local source not found: $key"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done <<< "$SOURCE_KEYS"

  STATUS="OK"
  [ "$MISSING_COUNT" -gt 0 ] && STATUS="WARNINGS ($MISSING_COUNT missing sources)"
  echo "  -> $STATUS"

  if [ -n "$EXPLICIT_ADDR" ]; then
      ADDRESS_VAL="$EXPLICIT_ADDR"
  else
      ENV_VAR_NAME="$(to_upper "${CONTRACT_SAFE_NAME}")_ADDRESS"
      ADDRESS_VAL="${!ENV_VAR_NAME:-}"
      [ -z "$ADDRESS_VAL" ] && ADDRESS_VAL="<set env $ENV_VAR_NAME or pass ${CONTRACT_SAFE_NAME}=0xAddress>"
  fi

  {
    echo "- $CONTRACT_SAFE_NAME"
    echo "  File: $OUT_FILE"
    echo "  Address: $ADDRESS_VAL"
    echo "  Upload to: https://hashscan.io/<networkType>/contract/<address> -> Verify"
    echo ""
  } >> "$MANIFEST"
done

echo ""
echo "Done. See $MANIFEST for upload instructions."
echo ""
echo "HashScan verification steps:"
echo "  1. Go to hashscan.io/<networkType>/contract/<address>"
echo "  2. Click 'Verify Contract'"
echo "  3. Upload the metadata.json file from verify-bundles/<ContractName>/"