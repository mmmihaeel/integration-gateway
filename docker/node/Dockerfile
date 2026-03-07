FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache bash curl

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

CMD ["npm", "run", "start"]
