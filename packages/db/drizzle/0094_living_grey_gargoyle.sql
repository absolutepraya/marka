CREATE TABLE `bookmarkContentEditors` (
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`bookmarkId`, `userId`),
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkContentEditors_userId_idx` ON `bookmarkContentEditors` (`userId`);