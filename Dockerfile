FROM mcr.microsoft.com/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    SAVLIVO_BROWSER_RUNTIME=LOCAL_CONTAINER

WORKDIR /opt/render/project/src
COPY . .

RUN npm ci --include=dev \
    && npm ci --omit=dev --ignore-scripts --prefix infrastructure/browser-runtime \
    && npm ci --omit=dev --ignore-scripts --prefix infrastructure/playwright-client \
    && npm --workspace @savlivo/api run build \
    && mkdir -p .savlivo \
    && npm cache clean --force

CMD ["node", "infrastructure/api-runtime/supervisor.mjs"]
