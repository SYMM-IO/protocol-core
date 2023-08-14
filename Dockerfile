######################################################################
# v3-deus
######################################################################
ARG COMMIT_ID
ARG COMMIT_TIMESTAMP
ARG COMMIT_AUTHOR

ENV COMMIT_ID=${COMMIT_ID}
ENV COMMIT_TIMESTAMP=${COMMIT_TIMESTAMP}
ENV COMMIT_AUTHOR=${COMMIT_AUTHOR}
######################################################################

# Build stage
FROM node
RUN npm config set fetch-retries 10
RUN npm config set fetch-retry-mintimeout 20000
RUN npm install -g npm
RUN mkdir /app

COPY package.json /app/
WORKDIR /app

RUN npm install --ignore-scripts

RUN mkdir -p /app/deus

COPY . /app/deus
WORKDIR /app/deus
RUN cp .env.example .env
RUN ln -s /app/node_modules .
RUN npm run postinstall
RUN ./docker/compile.sh
