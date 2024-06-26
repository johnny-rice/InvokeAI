import { Box, Textarea } from '@invoke-ai/ui-library';
import { useAppDispatch } from 'app/store/storeHooks';
import { RGLayerPromptDeleteButton } from 'features/controlLayers/components/RGLayer/RGLayerPromptDeleteButton';
import { useLayerPositivePrompt } from 'features/controlLayers/hooks/layerStateHooks';
import { rgLayerPositivePromptChanged } from 'features/controlLayers/store/controlLayersSlice';
import { PromptOverlayButtonWrapper } from 'features/parameters/components/Prompts/PromptOverlayButtonWrapper';
import { AddPromptTriggerButton } from 'features/prompt/AddPromptTriggerButton';
import { PromptPopover } from 'features/prompt/PromptPopover';
import { usePrompt } from 'features/prompt/usePrompt';
import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  layerId: string;
};

export const RGLayerPositivePrompt = memo(({ layerId }: Props) => {
  const prompt = useLayerPositivePrompt(layerId);
  const dispatch = useAppDispatch();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const _onChange = useCallback(
    (v: string) => {
      dispatch(rgLayerPositivePromptChanged({ layerId, prompt: v }));
    },
    [dispatch, layerId]
  );
  const { onChange, isOpen, onClose, onOpen, onSelect, onKeyDown } = usePrompt({
    prompt,
    textareaRef,
    onChange: _onChange,
  });

  return (
    <PromptPopover isOpen={isOpen} onClose={onClose} onSelect={onSelect} width={textareaRef.current?.clientWidth}>
      <Box pos="relative" w="full">
        <Textarea
          id="prompt"
          name="prompt"
          ref={textareaRef}
          value={prompt}
          placeholder={t('parameters.positivePromptPlaceholder')}
          onChange={onChange}
          onKeyDown={onKeyDown}
          variant="darkFilled"
          paddingRight={30}
          minH={28}
        />
        <PromptOverlayButtonWrapper>
          <RGLayerPromptDeleteButton layerId={layerId} polarity="positive" />
          <AddPromptTriggerButton isOpen={isOpen} onOpen={onOpen} />
        </PromptOverlayButtonWrapper>
      </Box>
    </PromptPopover>
  );
});

RGLayerPositivePrompt.displayName = 'RGLayerPositivePrompt';
