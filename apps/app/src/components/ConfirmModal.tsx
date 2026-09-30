import type { ReactNode } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';
import { Button } from './Button';

type Props = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmVariant?: 'primary' | 'danger';
  children?: ReactNode;
};

/** iOS·Web에서 같은 모양으로 뜨는 확인 창(Alert는 Web 미지원). */
export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  confirmVariant = 'primary',
  children,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
          {children}
          <View style={styles.actions}>
            <Button title="취소" variant="secondary" onPress={onCancel} disabled={loading} />
            <Button title={confirmLabel} variant={confirmVariant} onPress={onConfirm} loading={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(38, 59, 49, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: '700', color: colors.text },
  description: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 24 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
});
