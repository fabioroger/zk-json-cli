FROM node:lts

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm i

COPY ./src ./src
COPY ./bin ./bin

RUN npm link
