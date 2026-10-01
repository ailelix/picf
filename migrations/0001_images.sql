-- url 存相对路径（即 R2 key，如 2026/09/abc123.webp），域名在访问时拼接，换域名不用改数据
CREATE TABLE images (
	id         TEXT    PRIMARY KEY,
	url        TEXT    NOT NULL,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX images_created_at ON images (created_at DESC);
