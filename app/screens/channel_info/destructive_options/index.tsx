// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';

import LeaveChannelLabel from '@components/channel_actions/leave_channel_label';
import {General} from '@constants';
import {isOfficialTunagChannel} from '@utils/official_channel_utils';

import Archive from './archive';
import ConvertPrivate from './convert_private';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    channelId: string;
    componentId: AvailableScreens;
    type?: ChannelType;
    channel?: Channel;
}

const DestructiveOptions = ({channelId, componentId, type, channel}: Props) => {
    const [isOfficial, setIsOfficial] = useState(false);

    useEffect(() => {
        if (channel) {
            isOfficialTunagChannel(channel).then(setIsOfficial);
        }
    }, [channel]);

    if (isOfficial) {
        return null;
    }

    return (
        <>
            {type === General.OPEN_CHANNEL &&
            <ConvertPrivate channelId={channelId}/>
            }
            <LeaveChannelLabel
                channelId={channelId}
                isOptionItem={true}
                testID='channel_info.options.leave_channel.option'
            />
            {type !== General.DM_CHANNEL && type !== General.GM_CHANNEL &&
            <Archive
                channelId={channelId}
                componentId={componentId}
                type={type}
            />
            }
        </>
    );
};

export default DestructiveOptions;
