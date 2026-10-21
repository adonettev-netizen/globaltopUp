/* Fix: all seeded countries should be marked as supported */
UPDATE countries SET is_supported = true WHERE is_supported = false;
