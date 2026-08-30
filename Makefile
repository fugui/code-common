.PHONY: all build test clean

all: test

build:
	@echo "Building code-common frontend..."
	cd frontend && ( [ -d node_modules ] || npm install ) && npm run build

test:
	@echo "Running Go tests for code-common backend..."
	cd backend && go test ./...

clean:
	@echo "Cleaning code-common..."
