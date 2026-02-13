FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Install sqlite3 as a build dependency if needed, but usually binary is fetched. 
# However, sometimes native modules need python/make/g++. 
# For now, we try simple 'npm ci'. If it fails, we add build tools.

# Command to run the app
CMD [ "npm", "start" ]
