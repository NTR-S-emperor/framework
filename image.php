<?php
/**
 * Automatic image optimizer proxy
 * Converts images to WebP on-the-fly and caches the result.
 * Transparent to the rest of the application - no code changes needed.
 *
 * Routed via .htaccess RewriteRule for image requests.
 *
 * Requirements: Apache mod_rewrite + PHP GD extension with WebP support.
 * Degrades gracefully: serves original images if requirements aren't met.
 *
 * Cache format: {pathPrefix}_{mtimeHash}.webp
 *   - pathPrefix (8 chars): stable ID for the source file path
 *   - mtimeHash (16 chars): changes when the source file is modified
 *   When a file changes, old versions are automatically deleted.
 */

$cacheDir = __DIR__ . '/.image_cache';

/**
 * Ensure cache directory exists and is writable by the web server.
 */
function ensureCacheDir() {
    global $cacheDir;
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
        @chmod($cacheDir, 0775);
    } elseif (!is_writable($cacheDir)) {
        @chmod($cacheDir, 0775);
    }
}

/**
 * Build cache path for a given file. Returns [cachePath, pathPrefix].
 */
function getCachePath($relativePath, $mtime) {
    global $cacheDir;
    $pathPrefix = substr(md5($relativePath), 0, 8);
    $mtimeHash = substr(md5($relativePath . ':' . $mtime), 0, 16);
    return [$cacheDir . '/' . $pathPrefix . '_' . $mtimeHash . '.webp', $pathPrefix];
}

/**
 * Delete old cached versions of a file (different mtime = outdated).
 */
function cleanOldCache($pathPrefix, $currentCachePath) {
    global $cacheDir;
    if (!is_dir($cacheDir)) return;
    foreach (glob($cacheDir . '/' . $pathPrefix . '_*.webp') as $oldFile) {
        if ($oldFile !== $currentCachePath) {
            @unlink($oldFile);
        }
    }
}

/**
 * Convert a single image to WebP. Returns true on success, false on failure/skip.
 */
function convertImage($sourcePath, $cachePath, $ext) {
    $sourceData = @file_get_contents($sourcePath);
    if (!$sourceData) return false;

    $image = @imagecreatefromstring($sourceData);
    if (!$image) return false;

    // Preserve transparency for PNG/GIF
    if (in_array($ext, ['png', 'gif'])) {
        imagepalettetotruecolor($image);
        imagealphablending($image, true);
        imagesavealpha($image, true);
    }

    // Determine quality based on file size
    $fileSize = filesize($sourcePath);
    if ($fileSize > 2 * 1024 * 1024) {
        $quality = 70;
    } elseif ($fileSize > 500 * 1024) {
        $quality = 78;
    } else {
        $quality = 85;
    }

    $success = @imagewebp($image, $cachePath, $quality);
    imagedestroy($image);

    if (!$success || !is_file($cachePath)) return false;

    // If WebP is larger than original, not worth it
    if (filesize($cachePath) >= $fileSize) {
        @unlink($cachePath);
        return false;
    }

    return true;
}

/**
 * Send cache headers tied to source file's modification time.
 * Cloudflare and browsers cache for 1 year, but ETag ensures
 * instant revalidation when the source file changes.
 */
function sendCacheHeaders($sourcePath) {
    $mtime = filemtime($sourcePath);
    $etag = '"' . md5($sourcePath . ':' . $mtime) . '"';

    header('Cache-Control: public, max-age=31536000');
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
    header('ETag: ' . $etag);

    // 304 Not Modified if client already has this version
    $ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
    $ifModifiedSince = isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) ? strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) : 0;

    if ($ifNoneMatch === $etag || ($ifModifiedSince && $ifModifiedSince >= $mtime)) {
        http_response_code(304);
        exit;
    }
}

/**
 * Serve the original file with proper headers.
 */
function serveOriginal($path, $ext) {
    sendCacheHeaders($path);
    $mimeTypes = [
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'png' => 'image/png', 'gif' => 'image/gif',
        'bmp' => 'image/bmp', 'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
    ];
    $mime = isset($mimeTypes[$ext]) ? $mimeTypes[$ext] : 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    readfile($path);
}

$convertibleExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp'];

// ─── Status endpoint: image.php?status=1 ───
if (isset($_GET['status'])) {
    header('Content-Type: application/json');
    $cacheSize = 0;
    $cacheCount = 0;
    if (is_dir($cacheDir)) {
        foreach (glob($cacheDir . '/*.webp') as $f) {
            $cacheSize += filesize($f);
            $cacheCount++;
        }
    }
    echo json_encode([
        'gd' => extension_loaded('gd'),
        'webp' => function_exists('imagewebp'),
        'active' => extension_loaded('gd') && function_exists('imagewebp'),
        'cache_files' => $cacheCount,
        'cache_size_mb' => round($cacheSize / 1024 / 1024, 2),
    ]);
    exit;
}

// ─── Clear cache endpoint: image.php?clear_cache=1 ───
if (isset($_GET['clear_cache'])) {
    $deleted = 0;
    if (is_dir($cacheDir)) {
        foreach (glob($cacheDir . '/*.webp') as $f) {
            unlink($f);
            $deleted++;
        }
    }
    header('Content-Type: application/json');
    echo json_encode(['deleted' => $deleted]);
    exit;
}

// ─── Pre-convert all images: image.php?warm_cache=1 ───
if (isset($_GET['warm_cache'])) {
    if (!function_exists('imagecreatefromstring') || !function_exists('imagewebp')) {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'GD with WebP support is required']);
        exit;
    }

    ensureCacheDir();

    $converted = 0;
    $skipped = 0;
    $failed = 0;
    $savedBytes = 0;

    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__));
    foreach ($it as $file) {
        if (!$file->isFile()) continue;
        $ext = strtolower($file->getExtension());
        if (!in_array($ext, $convertibleExts)) continue;

        $realPath = $file->getRealPath();
        $relativePath = ltrim(str_replace(realpath(__DIR__), '', $realPath), '/\\');
        $relativePath = str_replace('\\', '/', $relativePath);

        if (strpos($relativePath, '.image_cache') === 0) continue;

        $mtime = filemtime($realPath);
        list($cachePath, $pathPrefix) = getCachePath($relativePath, $mtime);

        // Clean old versions
        cleanOldCache($pathPrefix, $cachePath);

        // Already cached
        if (is_file($cachePath)) {
            $skipped++;
            continue;
        }

        $originalSize = filesize($realPath);
        if (convertImage($realPath, $cachePath, $ext)) {
            $savedBytes += ($originalSize - filesize($cachePath));
            $converted++;
        } else {
            $skipped++; // WebP was larger or conversion failed — original will be served
        }
    }

    header('Content-Type: application/json');
    echo json_encode([
        'converted' => $converted,
        'skipped' => $skipped,
        'saved_mb' => round($savedBytes / 1024 / 1024, 2),
    ]);
    exit;
}

// ─── Main: serve an image request ───

$requestedFile = isset($_GET['f']) ? $_GET['f'] : '';

// Security: prevent directory traversal
$requestedFile = str_replace(['..', "\0"], '', $requestedFile);
$requestedFile = ltrim($requestedFile, '/');

$filePath = __DIR__ . '/' . $requestedFile;

$realBase = realpath(__DIR__);
$realFile = realpath($filePath);

if (!$realFile || strpos($realFile, $realBase) !== 0 || !is_file($realFile)) {
    http_response_code(404);
    exit;
}

$ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
$convertible = in_array($ext, $convertibleExts);

$acceptsWebp = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'image/webp') !== false;
$canConvert = $convertible && $acceptsWebp && function_exists('imagecreatefromstring') && function_exists('imagewebp');

if (!$canConvert) {
    serveOriginal($realFile, $ext);
    exit;
}

// Cache
ensureCacheDir();

$fileMtime = filemtime($realFile);
list($cachePath, $pathPrefix) = getCachePath($requestedFile, $fileMtime);

// Clean old versions of this file
cleanOldCache($pathPrefix, $cachePath);

// Serve from cache
if (is_file($cachePath)) {
    sendCacheHeaders($realFile);
    header('Content-Type: image/webp');
    header('Content-Length: ' . filesize($cachePath));
    header('X-Image-Optimized: cached');
    readfile($cachePath);
    exit;
}

// Convert
if (convertImage($realFile, $cachePath, $ext)) {
    sendCacheHeaders($realFile);
    header('Content-Type: image/webp');
    header('Content-Length: ' . filesize($cachePath));
    header('X-Image-Optimized: converted');
    readfile($cachePath);
} else {
    serveOriginal($realFile, $ext);
}
