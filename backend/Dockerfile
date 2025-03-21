# Use the official Bun image
FROM oven/bun:1

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb (if exists)
COPY package.json bun.lockb* ./

# Install production dependencies
RUN bun install --production

# Copy application code
COPY . .

# Expose the port (default 3000, adjust if different)
EXPOSE 3000

# Run the server
CMD ["bun", "server/index.ts"]