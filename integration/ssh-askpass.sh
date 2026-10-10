#!/bin/sh
# OpenSSH runs this for a password or passphrase outside Windows: Agentrix's own executable, as Node, runs
# ssh-askpass.cjs, which asks the window.
ELECTRON_RUN_AS_NODE=1 exec "$AGENTRIX_ASKPASS_NODE" "$AGENTRIX_ASKPASS_SCRIPT" "$@"
