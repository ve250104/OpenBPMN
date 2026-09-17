#!/bin/sh
set -eu
unset NODE_OPTIONS NODE_PATH

# This bootstrap uses only the runtime shipped beside it. Setup is local;
# selecting or downloading a candidate is an explicit preceding operation.
script_directory=${0%/*}
if [ "$script_directory" = "$0" ]; then script_directory=.; fi
bundle_root=$(CDPATH= cd -P -- "$script_directory" && pwd -P)
private_runtime="$bundle_root/runtime/bin/node"
management="$bundle_root/app/dist/manage.js"

if [ ! -x "$private_runtime" ] || [ ! -f "$management" ]; then
  printf '%s\n' 'Incomplete OpenBPMN bundle: extract the complete platform archive before running setup.' >&2
  exit 2
fi

exec "$private_runtime" "$management" setup --bundle "$bundle_root" "$@"
