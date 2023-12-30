# Project: symmio
# Description: -

FROM node:lts

######################################################################
# LABELS
######################################################################
ARG COMMIT_ID
ARG COMMIT_TIMESTAMP
ARG COMMIT_AUTHOR
ARG BUILD_APPLICATION
ARG BUILD_DATE

LABEL org.vcs.CommitId=${COMMIT_ID}
LABEL org.vcs.CommitTimestamp=${COMMIT_TIMESTAMP}
LABEL org.vcs.CommitAuthor=${COMMIT_AUTHOR}
LABEL org.build.Application=${BUILD_APPLICATION}
LABEL org.build.Date=${BUILD_DATE}

######################################################################
# BUILD STAGE
######################################################################
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
