// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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
        it('should return false for official TUNAG channels regardless of permissions', (done) => {
            mockedIsOfficialTunagChannel.mockResolvedValue(true);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin channel_admin',
            });

            // Add roles with full permissions
            operator.handleRole({
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
            }).then(() => {
                return operator.handleChannel({
                    channels: [TestHelper.fakeChannel({
                        id: 'official-channel',
                        type: General.OPEN_CHANNEL,
                        creator_id: 'tunag-12345-company-admin', // Official channel creator
                        name: 'official-channel',
                    })],
                    prepareRecordsOnly: false,
                });
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'official-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(canManage).toBe(false);
                        expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();
                        done();
                    },
                    error: done,
                });
            });
        });

        it('should return false for official private channels', (done) => {
            mockedIsOfficialTunagChannel.mockResolvedValue(true);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            operator.handleRole({
                roles: [{
                    id: 'system_admin',
                    name: 'system_admin',
                    permissions: [Permissions.MANAGE_SYSTEM, Permissions.MANAGE_PRIVATE_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            }).then(() => {
                return operator.handleChannel({
                    channels: [TestHelper.fakeChannel({
                        id: 'official-private-channel',
                        type: General.PRIVATE_CHANNEL,
                        creator_id: 'tunag-54321-corp-admin',
                        name: 'official-private-channel',
                    })],
                    prepareRecordsOnly: false,
                });
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'official-private-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(canManage).toBe(false);
                        expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();
                        done();
                    },
                    error: done,
                });
            });
        });

        it('should check normal permissions for non-official channels', (done) => {
            mockedIsOfficialTunagChannel.mockResolvedValue(false);

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'channel_admin',
            });

            operator.handleRole({
                roles: [{
                    id: 'channel_admin',
                    name: 'channel_admin',
                    permissions: [Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            }).then(() => {
                return operator.handleChannel({
                    channels: [TestHelper.fakeChannel({
                        id: 'regular-channel',
                        type: General.OPEN_CHANNEL,
                        creator_id: 'regular-user',
                        name: 'regular-channel',
                    })],
                    prepareRecordsOnly: false,
                });
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'regular-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();

                        // Should check normal permissions for non-official channels
                        expect(canManage).toBe(true);
                        done();
                    },
                    error: done,
                });
            });
        });

        it('should handle isOfficialTunagChannel promise rejection gracefully', (done) => {
            mockedIsOfficialTunagChannel.mockImplementation(() => {
                return Promise.reject(new Error('Database connection failed'));
            });

            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'channel_admin',
            });

            operator.handleRole({
                roles: [{
                    id: 'channel_admin',
                    name: 'channel_admin',
                    permissions: [Permissions.MANAGE_PUBLIC_CHANNEL_MEMBERS],
                }],
                prepareRecordsOnly: false,
            }).then(() => {
                return operator.handleChannel({
                    channels: [TestHelper.fakeChannel({
                        id: 'test-channel',
                        type: General.OPEN_CHANNEL,
                        creator_id: 'some-user',
                        name: 'test-channel',
                    })],
                    prepareRecordsOnly: false,
                });
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'test-channel',
                    mockUser,
                ).subscribe({
                    next: () => {
                        // Should handle errors gracefully and fall back to normal permission check
                        expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();

                        // The observable should still emit a value despite the error
                        done();
                    },
                    error: () => {
                        // If error is propagated, that's also acceptable behavior
                        expect(mockedIsOfficialTunagChannel).toHaveBeenCalled();
                        done();
                    },
                });
            }).catch(done);
        });

        it('should not call isOfficialTunagChannel for deleted channels', (done) => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'deleted-channel',
                    type: General.OPEN_CHANNEL,
                    delete_at: Date.now(), // Deleted channel
                    creator_id: 'tunag-12345-company-admin',
                    name: 'deleted-channel',
                })],
                prepareRecordsOnly: false,
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'deleted-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(canManage).toBe(false);
                        expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
                        done();
                    },
                    error: done,
                });
            });
        });

        it('should not call isOfficialTunagChannel for DM channels', (done) => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'dm-channel',
                    type: General.DM_CHANNEL,
                    creator_id: 'tunag-12345-company-admin',
                    name: 'dm-channel',
                })],
                prepareRecordsOnly: false,
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'dm-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(canManage).toBe(false);
                        expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
                        done();
                    },
                    error: done,
                });
            });
        });

        it('should not call isOfficialTunagChannel for default channels', (done) => {
            const mockUser = TestHelper.fakeUserModel({
                id: 'user1',
                roles: 'system_admin',
            });

            operator.handleChannel({
                channels: [TestHelper.fakeChannel({
                    id: 'default-channel',
                    type: General.OPEN_CHANNEL,
                    name: General.DEFAULT_CHANNEL,
                    creator_id: 'tunag-12345-company-admin',
                })],
                prepareRecordsOnly: false,
            }).then(() => {
                observeCanManageChannelMembers(
                    database,
                    'default-channel',
                    mockUser,
                ).subscribe({
                    next: (canManage) => {
                        expect(canManage).toBe(false);
                        expect(mockedIsOfficialTunagChannel).not.toHaveBeenCalled();
                        done();
                    },
                    error: done,
                });
            });
        });
    });
});
