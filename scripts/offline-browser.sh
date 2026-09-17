#!/bin/sh
# Test-only wrapper: observe the same local browser used by the production CLI.
exec "$OPENBPMN_TEST_BROWSER" --log-net-log="$OPENBPMN_TEST_NETLOG" --net-log-capture-mode=Default "$@"
