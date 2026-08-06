# TypeScript needs the `tsc` compiler on top of Node, which isn't in
# the base node image -- this is the one language needing a custom
# image rather than an official upstream one as-is.
FROM node:20-slim
RUN npm install -g typescript
