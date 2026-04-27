import { useState } from 'react';
import {
  Drawer, DrawerHeader, DrawerHeaderTitle, DrawerBody, Button, Text,
} from '@fluentui/react-components';
import { Bot24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  launcher: {
    position: 'fixed',
    right: '1.5rem',
    bottom: '1.5rem',
    borderRadius: '999px',
    minWidth: '3rem',
    height: '3rem',
    zIndex: '1000',
  },
});

export function AgentFlyoutLauncher(): JSX.Element {
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  return (
    <>
      <Button
        appearance="primary"
        icon={<Bot24Regular />}
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        aria-expanded={open}
        aria-controls="agent-flyout"
        className={styles.launcher}
      />
      <Drawer
        id="agent-flyout"
        type="overlay"
        position="end"
        open={open}
        onOpenChange={(_e, data) => setOpen(data.open)}
        aria-label="Assistant"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
              />
            }
          >
            Assistant
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col gap-2">
            <Text weight="semibold">Coming soon</Text>
            <Text>An AI assistant scoped to this workspace will be available in a future release.</Text>
          </div>
        </DrawerBody>
      </Drawer>
    </>
  );
}
