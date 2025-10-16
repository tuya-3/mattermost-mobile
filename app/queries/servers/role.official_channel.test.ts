// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {firstValueFrom} from 'rxjs';

import {General, Permissions} from '@constants';
import DatabaseManager from '@database/manager';
import TestHelper from '@test/test_helper';
import {isOfficialTunagChannel} from '@utils/official_channel_utils';

import {observeCanManageChannelMembers} from './role';

import type ServerDataOperator from '@database/operator/server_data_operator';
import type {Database} from '@nozbe/watermelondb';

// Mock the utility function
jest.mock('@utils/official_channel_utils', () => ({
    isOfficialTunagChannel: jest.fn(),
}));

const mockedIsOfficialTunagChannel = isOfficialTunagChannel as jest.MockedFunction<typeof isOfficialTunagChannel>;

describe('Official Channel Role Restrictions', () => {
    const serverUrl = 'baseHandler.test.com';
    let database: Database;
    let operator: ServerDataOperator;

    beforeEach(async () => {
        await DatabaseManager.init([serverUrl]);
        const serverDatabaseAndOperator = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
        database = serverDatabaseAndOperator.database;
        operator = serverDatabaseAndOperator.operator;
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await DatabaseManager.destroyServerDatabase(serverUrl);
    });

    describe('observeCanManageChannelMembers with Official Channel Support', () => {
        it('should return false for official TUNAG channels regardless of permissions', async () => {
            mockedIsOfficialTunagChannel.mockResolvedValue(true);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin channel_admin',
            });

            // Add roles with full permissions
            await operator.handleRole({
                roles: [
                    {
                        id: 'system_admin',
                        name: 'system_admin',
                        permissions: [Permissions.MANAGE_SYSTEM, Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS],
                    },
                    {
                        id: 'channel_admin',
                        name: 'channel_admin',
                        permissions: [Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS, Permissions.MANAGE_PRIVATE_CHANNEL_MEMBERS],
                    },
                ],
                prepareRecordsOnly: false,
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'official-channel',
                    type: General.OPEN_CHANNEL,
                    creator_id: 'tunag-12345-company-admin', // Official channel creator
                    name: 'official-channel',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'official-channel',
                    mockUser,
                ),
            );

            expect(canManage).toBe(false);
            expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();
        });

        it('should return false for official private channels', async () => {
            mockedIsOfficialTunagChannel.mockResolvedValue(true);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            await operator.handleRole({
                roles: [{
                    id: 'system_admin',
                    name: 'system_admin',
                    permissions: [Permissions.MANAGE_SYSTEM, Permissions.MANAGE_PRIVATE_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'official-private-channel',
                    type: General.PRIVATE_CHANNEL,
                    creator_id: 'tunag-54321-corp-admin',
                    name: 'official-private-channel',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'official-private-channel',
                    mockUser,
                ),
            );

            expect(canManage).toBe(false);
            expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();
        });

        it('should check normal permissions for non-official channels', async () => {
            mockedIsOfficialTunagChannel.mockResolvedValue(false);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'channel_admin',
            });

            await operator.handleRole({
                roles: [{
                    id: 'channel_admin',
                    name: 'channel_admin',
                    permissions: [Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'regular-channel',
                    type: General.OPEN_CHANNEL,
                    creator_id: 'regular-user',
                    name: 'regular-channel',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'regular-channel',
                    mockUser,
                ),
            );

            expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();

            // Should check normal permissions for non-official channels
            expect(canManage).toBe(true);
        });

        it('should handle isOfficialTunagChannel promise rejection gracefully', async () => {
            mockedIsOfficialTunagChannel.mockImplementation(() => {
                return Promise.reject(new Error('Database connection failed'));
            });

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'channel_admin',
            });

            await operator.handleRole({
                roles: [{
                    id: 'channel_admin',
                    name: 'channel_admin',
                    permissions: [Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'test-channel',
                    type: General.OPEN_CHANNEL,
                    creator_id: 'some-user',
                    name: 'test-channel',
                })],
                prepareRecordsOnly: false,
            });

            // Should handle errors gracefully and fall back to normal permission check
            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'test-channel',
                    mockUser,
                ),
            );

            expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();

            // The observable should still emit a value despite the error (due to catchError)
            expect(typeof canManage).toBe('boolean');
        });

        it('should not call isOfficialTunagChannel for deleted channels', async () => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'deleted-channel',
                    type: General.OPEN_CHANNEL,
                    delete_at: Date.now(), // Deleted channel
                    creator_id: 'tunag-12345-company-admin',
                    name: 'deleted-channel',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'deleted-channel',
                    mockUser,
                ),
            );

            expect(canManage).toBe(false);
            expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
        });

        it('should not call isOfficialTunagChannel for DM channels', async () => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'dm-channel',
                    type: General.DM_CHANNEL,
                    creator_id: 'tunag-12345-company-admin',
                    name: 'dm-channel',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'dm-channel',
                    mockUser,
                ),
            );

            expect(canManage).toBe(false);
            expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
        });

        it('should not call isOfficialTunagChannel for default channels', async () => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            await operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'default-channel',
                    type: General.OPEN_CHANNEL,
                    name: General.DEFAULT_CHANNEL,
                    creator_id: 'tunag-12345-company-admin',
                })],
                prepareRecordsOnly: false,
            });

            const canManage = await firstValueFrom(
                observeCanManageChannelMembers(
                    database,
                    'default-channel',
                    mockUser,
                ),
            );

            expect(canManage).toBe(false);
            expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
        });
    });
});
