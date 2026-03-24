<?php
/**
 * Manifest Generator
 * Generates a compact manifest of all files with their hashes
 * Format: path:hash (8 chars MD5, one per line)
 *
 * Scans recursively from root - no need to list directories manually
 */

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('CDN-Cache-Control: no-store');
header('Cloudflare-CDN-Cache-Control: no-store');

// Clear PHP file stat cache to ensure fresh hashes
clearstatcache(true);

// Clear OPcache if available (forces PHP to re-read files)
if (function_exists('opcache_reset')) {
    opcache_reset();
}

// File extensions to include
$extensions = [
    'js', 'css', 'html', 'txt', 'json',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
    'mp4', 'webm', 'mp3', 'ogg', 'wav'
];

// Files/folders to exclude
$excludes = [
    'manifest.php',
    'index.php',
    'image.php',
    '.htaccess',
    '.git',
    '.image_cache',
    'node_modules',
    'vendor'
];

$manifest = [];

function scanDirectory($dir, $basePath, $extensions, $excludes, &$manifest) {
    if (!is_dir($dir)) return;

    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        if (in_array($item, $excludes)) continue;

        $path = $dir . '/' . $item;
        $relativePath = $basePath ? $basePath . '/' . $item : $item;

        // Clean up path (remove leading ./)
        $relativePath = preg_replace('#^\./#', '', $relativePath);

        if (is_dir($path)) {
            // Recurse into subdirectory
            scanDirectory($path, $relativePath, $extensions, $excludes, $manifest);
        } else {
            $ext = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            if (in_array($ext, $extensions)) {
                // Use first 8 chars of MD5 hash (enough for change detection)
                $hash = substr(md5_file($path), 0, 8);
                $manifest[$relativePath] = $hash;
            }
        }
    }
}

// Scan recursively from root
scanDirectory('.', '', $extensions, $excludes, $manifest);

// Sort by path for consistent output
ksort($manifest);

// Output in compact format: path:hash
foreach ($manifest as $path => $hash) {
    echo $path . ':' . $hash . "\n";
}
