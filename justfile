# Obsidian Duplicate Finder - common operations

# Default action: build the plugin
default: build

# Install dependencies
install:
    npm install

# Run production build
build:
    npm run build

# Run development watch mode
dev:
    npm run dev

# Run tests
test:
    npm run test

# Run tests with coverage
test-coverage:
    npm run test:coverage

# Lint the project
lint:
    npm run lint

# Deploy to Obsidian vault (requires OBSIDIAN_VAULT_ROOT environment variable)
deploy: build
    @if [ -z "$OBSIDIAN_VAULT_ROOT" ]; then \
        echo "Error: OBSIDIAN_VAULT_ROOT is not set."; \
        exit 1; \
    fi
    mkdir -p "$OBSIDIAN_VAULT_ROOT/.obsidian/plugins/duplicate-finder"
    cp main.js manifest.json styles.css "$OBSIDIAN_VAULT_ROOT/.obsidian/plugins/duplicate-finder/"
    @echo "Plugin deployed to $OBSIDIAN_VAULT_ROOT/.obsidian/plugins/duplicate-finder/"

# Clean generated files
clean:
    rm -f main.js
