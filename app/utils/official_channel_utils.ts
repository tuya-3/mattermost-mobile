// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import DatabaseManager from '@database/manager';
import {getUserById} from '@queries/servers/user';

/**
 * Regex pattern for official tunag integration admin usernames.
 * Pattern: tunag-{5digits}-{lowercase_alphanumeric_hyphens}-admin
 * Subdomain rules: lowercase letters, numbers, hyphens
 * Example: tunag-00002-stmn-admin
 */
const OFFICIAL_INTEGRATION_ADMIN_PATTERN = /^tunag-\d{5}-[a-z0-9-]+-admin$/;

/**
 * Check if a channel is an official tunag channel based on its creator's username.
 * Official channels are created by integration admin users with usernames matching the pattern:
 * tunag-{5digits}-{lowercase_alphanumeric_hyphens}-admin
 *
 * @param {Channel | string | null | undefined} channel - Channel object
 * @returns {Promise<boolean>} - true if channel is an official tunag channel, false otherwise
 */
export async function isOfficialTunagChannel(
    channel: Channel | string | null | undefined,
): Promise<boolean> {
    // If it's a string, we cannot validate creator, so return false
    if (typeof channel === 'string' || !channel) {
        return false;
    }

    const creatorId = channel.creator_id;

    if (!creatorId) {
        return false;
    }

    try {
        // Get the active server database
        const database = await DatabaseManager.getActiveServerDatabase();

        if (!database) {
            return false;
        }

        // Get the creator user from database
        const creator = await getUserById(database, creatorId);

        if (!creator || !creator.username) {
            return false;
        }

        // Check if creator's username matches the integration admin pattern
        return OFFICIAL_INTEGRATION_ADMIN_PATTERN.test(creator.username);
    } catch {
        // Database error, return false
        return false;
    }
}
