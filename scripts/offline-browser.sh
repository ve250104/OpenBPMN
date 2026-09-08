#!/bin/sh
# Test-only wrapper: observe the same local browser used by the production CLI.
exec "$BPMN_WEAVE_TEST_BROWSER" --log-net-log="$BPMN_WEAVE_TEST_NETLOG" --net-log-capture-mode=Default "$@"
