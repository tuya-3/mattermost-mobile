// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen} from '@screens/navigation';
import {isOfficialTunagChannel} from '@utils/official_channel_utils';

type Props = {
    channelId: string;
    channel?: Channel;
}

const EditChannel = ({channelId, channel}: Props) => {
    const {formatMessage} = useIntl();
    const [isOfficial, setIsOfficial] = useState(false);
    const title = formatMessage({id: 'screens.channel_edit', defaultMessage: 'Edit Channel'});

    useEffect(() => {
        if (channel) {
            isOfficialTunagChannel(channel).then(setIsOfficial);
        }
    }, [channel]);

    const goToEditChannel = usePreventDoubleTap(useCallback(async () => {
        goToScreen(Screens.CREATE_OR_EDIT_CHANNEL, title, {channelId});
    }, [channelId, title]));

    if (isOfficial) {
        return null;
    }

    return (
        <OptionItem
            action={goToEditChannel}
            label={title}
            icon='pencil-outline'
            type={Platform.select({ios: 'arrow', default: 'default'})}
            testID='channel_info.options.edit_channel.option'
        />
    );
};

export default EditChannel;
