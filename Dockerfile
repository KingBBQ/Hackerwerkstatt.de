FROM node:18-alpine

# Install git and Docker CLI for one-click deployment feature
RUN apk add --no-cache git docker-cli docker-cli-compose

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]
