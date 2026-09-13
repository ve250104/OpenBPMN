# Supplemental Linux isolation environment. ARM/Chromium does not qualify Ubuntu x64/Chrome support.
FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8
RUN test "$(node -p process.arch)" = "$(test "$(uname -m)" = aarch64 && printf arm64 || printf x64)"
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox ca-certificates
COPY test-offline.mjs offline-isolation.mjs offline-node.cjs offline-browser.sh /harness/
RUN chmod 755 /harness/offline-browser.sh && mkdir /work && chown -R node:node /work /harness
USER node
WORKDIR /work
