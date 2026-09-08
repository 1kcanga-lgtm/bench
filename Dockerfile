# Card Ledger -- self-hosted image.
# The frontend is already pre-built (public/app.bundle.js is committed, not generated here),
# so this image only ever needs to install the small backend (Express + SQLite) and run it --
# no frontend build tools required inside the image at all.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY bulk-import.js ./
COPY public ./public

RUN mkdir -p /app/data

ENV DB_PATH=/app/data/card-ledger.db
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
