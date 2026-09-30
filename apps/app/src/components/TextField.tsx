import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  help?: string;
  /** 비밀번호 칸: 입력을 가리고 보기/숨기기 버튼을 둔다 */
  secure?: boolean;
} & Pick<TextInputProps, 'autoComplete' | 'textContentType' | 'returnKeyType' | 'onSubmitEditing' | 'editable' | 'maxLength'>;

export function TextField({ label, error, help, secure = false, ...inputProps }: Props) {
  const [hidden, setHidden] = useState(secure);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          style={styles.input}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && hidden}
          placeholderTextColor={colors.textMuted}
          {...inputProps}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? `${label} 보기` : `${label} 숨기기`}
            onPress={() => setHidden((value) => !value)}
            style={styles.toggle}>
            <Text style={styles.toggleText}>{hidden ? '보기' : '숨기기'}</Text>
          </Pressable>
        )}
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.caption, fontWeight: '600', color: colors.text },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputRowError: { borderColor: colors.danger },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: fontSize.body, color: colors.text },
  toggle: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  toggleText: { fontSize: fontSize.caption, fontWeight: '600', color: colors.primary },
  help: { fontSize: fontSize.caption, color: colors.textMuted },
  error: { fontSize: fontSize.caption, color: colors.danger },
});
