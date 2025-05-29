# PowerShell script for Docker build and push

# Stop on error
$ErrorActionPreference = "Stop"

# Get version from package.json using PowerShell
$packageJson = Get-Content -Raw -Path "./package.json" | ConvertFrom-Json
$VERSION = $packageJson.version

# Docker image name
$IMAGE_NAME = "douge/lanraragi"

Write-Host "Building Docker image for LANraragi version $VERSION..."

# Build the image
docker build -t ${IMAGE_NAME}:${VERSION} -f ./tools/build/docker/Dockerfile .

Write-Host "Tagging latest..."
# Tag as latest
docker tag ${IMAGE_NAME}:${VERSION} ${IMAGE_NAME}:latest

Write-Host "Pushing images to Docker Hub..."
# Push both version-specific and latest tags
docker push ${IMAGE_NAME}:${VERSION}
docker push ${IMAGE_NAME}:latest

Write-Host "Done! Successfully pushed:"
Write-Host "- ${IMAGE_NAME}:${VERSION}"
Write-Host "- ${IMAGE_NAME}:latest" 