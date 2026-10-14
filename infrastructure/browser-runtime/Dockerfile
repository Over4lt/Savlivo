FROM mcr.microsoft.com/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PORT=3000

WORKDIR /srv/browser-runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

USER pwuser
EXPOSE 3000
CMD ["npm", "start"]
