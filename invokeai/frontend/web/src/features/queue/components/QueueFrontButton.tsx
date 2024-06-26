import { IconButton } from '@invoke-ai/ui-library';
import { useQueueFront } from 'features/queue/hooks/useQueueFront';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AiFillThunderbolt } from 'react-icons/ai';

import { QueueButtonTooltip } from './QueueButtonTooltip';

const QueueFrontButton = () => {
  const { t } = useTranslation();
  const { queueFront, isLoading, isDisabled } = useQueueFront();
  return (
    <QueueButtonTooltip prepend>
      <IconButton
        aria-label={t('queue.queueFront')}
        isDisabled={isDisabled}
        isLoading={isLoading}
        onClick={queueFront}
        icon={<AiFillThunderbolt />}
        size="lg"
      />
    </QueueButtonTooltip>
  );
};

export default memo(QueueFrontButton);
