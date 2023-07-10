# Copyright (c) 2023 Joshua Schmitt
# 
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT

FROM node:20-alpine as base

RUN npm install -g pnpm

FROM base as run

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY . .

CMD ["pnpm", "start"]
