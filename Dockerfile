# Playwright 1.58.2 child manifests:
# linux/amd64: mcr.microsoft.com/playwright@sha256:65cefd09a5e943921ecd3a6e5414c603db2eb161e9eb48f2e2ccc63486dc7dc0
# linux/arm64: mcr.microsoft.com/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323
FROM mcr.microsoft.com/playwright@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /opt/render/project/src
COPY . .

RUN npm ci --include=dev \
    && npm ci --omit=dev --ignore-scripts --prefix infrastructure/browser-runtime \
    && npm ci --omit=dev --ignore-scripts --prefix infrastructure/playwright-client \
    && npm --workspace @savlivo/api run build \
    && mkdir -p .savlivo \
    && npm cache clean --force

CMD ["node", "infrastructure/api-runtime/supervisor.mjs"]
