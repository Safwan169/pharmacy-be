# Build once with the full toolchain, then ship only what running needs.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
# pg_dump and pg_restore are what `npm run backup` and POST /admin/backup call.
# The client major must match the postgres image in docker-compose.yml, or a
# dump taken here cannot be restored there.
# tzdata so the nightly backup fires at 2 a.m. in Dhaka rather than in UTC,
# and so dump filenames read in the shop's own time.
RUN apk add --no-cache postgresql17-client tzdata
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The catalogue seed opens this by path relative to the working directory, so
# the one data file the image needs comes across even though src/ does not.
COPY src/docs/medicine.csv ./src/docs/medicine.csv
COPY docker/nightly-backup.sh ./docker/nightly-backup.sh
# Belt as well as braces: .gitattributes keeps carriage returns out of the
# checkout, and this keeps them out of the image even when someone builds from
# a working copy that predates it. /bin/sh reads a stray  as part of the
# command, which is a restart loop rather than an error anybody would spot.
RUN sed -i 's/$//' docker/nightly-backup.sh
EXPOSE 5002
CMD ["node", "dist/main"]
