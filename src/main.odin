package main

@(export)
unicode_count :: proc "contextless" () -> i32 {
	total: i32 = 0
	for unicode_range in UNICODE_RANGES {
		total += unicode_range.end - unicode_range.start + 1
	}
	return total
}

@(export)
unicode_codepoint_at :: proc "contextless" (index: i32) -> i32 {
	if index < 0 {
		return -1
	}
	remaining := index
	for unicode_range in UNICODE_RANGES {
		range_count := unicode_range.end - unicode_range.start + 1
		if remaining < range_count {
			return unicode_range.start + remaining
		}
		remaining -= range_count
	}
	return -1
}

@(export)
unicode_category_at :: proc "contextless" (index: i32) -> i32 {
	if index < 0 {
		return -1
	}
	remaining := index
	for unicode_range in UNICODE_RANGES {
		range_count := unicode_range.end - unicode_range.start + 1
		if remaining < range_count {
			return i32(unicode_range.category)
		}
		remaining -= range_count
	}
	return -1
}