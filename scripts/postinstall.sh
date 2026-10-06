#!/bin/bash

# Run patch-package first
npx patch-package

# OpenCL headers for llama.rn build from source.
# Pinned to an exact upstream commit (KhronosGroup/OpenCL-Headers) so every
# build is reproducible and supply-chain changes cannot silently enter the
# binary. Bump the SHA deliberately, never track a moving branch.
OPENCL_HEADERS_DIR="node_modules/llama.rn/third_party/OpenCL-Headers"
OPENCL_HEADERS_COMMIT="30bc20a8e90468e231d7c639805ae61ad1fefa4f" # main as of 2026-10-06

if [ ! -d "$OPENCL_HEADERS_DIR" ]; then
    echo "Cloning OpenCL headers (pinned to ${OPENCL_HEADERS_COMMIT}) for llama.rn build from source..."
    mkdir -p "node_modules/llama.rn/third_party"
    git clone https://github.com/KhronosGroup/OpenCL-Headers.git "$OPENCL_HEADERS_DIR"
    git -C "$OPENCL_HEADERS_DIR" checkout --quiet "$OPENCL_HEADERS_COMMIT"
    ACTUAL_SHA="$(git -C "$OPENCL_HEADERS_DIR" rev-parse HEAD)"
    if [ "$ACTUAL_SHA" != "$OPENCL_HEADERS_COMMIT" ]; then
        echo "ERROR: OpenCL-Headers checkout mismatch (got $ACTUAL_SHA)" >&2
        rm -rf "$OPENCL_HEADERS_DIR"
        exit 1
    fi
    echo "OpenCL headers pinned at ${ACTUAL_SHA}."
else
    echo "OpenCL headers already present."
fi
