@echo off
echo Starting ChromaDB server...
echo.
echo This will start ChromaDB on http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

docker run -p 8000:8000 chromadb/chroma

pause
