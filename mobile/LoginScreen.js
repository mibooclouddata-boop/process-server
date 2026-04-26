import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform, Animated, Easing, ActivityIndicator,
  StatusBar, Keyboard, TouchableWithoutFeedback, Image,
} from 'react-native';

const TOSS_BLUE = '#3182F6';
const TEXT_900  = '#191F28';
const TEXT_500  = '#6B7684';
const TEXT_400  = '#8B95A1';
const BG_INPUT  = '#F2F4F6';
const DANGER    = '#F04452';

export default function LoginScreen({ onLogin }) {
  const [id, setId]         = useState('');
  const [pw, setPw]         = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [focused, setFocused] = useState(null);

  const shake   = useRef(new Animated.Value(0)).current;
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(24)).current;

  const canSubmit = id.trim().length > 0 && pw.length >= 4 && !loading;

  // Mount entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const triggerShake = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8,  duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,  duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 3,  duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,  duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    try {
      const ok = await onLogin({ id: id.trim(), password: pw });
      if (!ok) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다');
        triggerShake();
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View
            style={[
              s.container,
              { opacity: fadeIn, transform: [{ translateY: slideUp }] },
            ]}
          >
            {/* Top spacer — pushes content off the ceiling */}
            <View style={s.topSpacer} />

            {/* Brand block — left-aligned */}
            <View style={s.brandWrap}>
              <Image
                source={require('./assets/miboo_logo.png')}
                style={s.logo}
                resizeMode="contain"
              />
              <Text style={s.brandSub}>입출고 관리 시스템</Text>
            </View>

            {/* Hero — visual anchor */}
            <View style={s.heroWrap}>
              <Text style={s.hero}>다시 만나서{'\n'}반가워요</Text>
              <Text style={s.heroSub}>계정 정보를 입력하고 시작하세요</Text>
            </View>

            {/* Form */}
            <Animated.View
              style={[s.inputStack, { transform: [{ translateX: shake }] }]}
            >
              {/* 아이디 */}
              <View style={[
                s.inputField,
                focused === 'id' && s.inputFieldFocused,
                !!error && s.inputFieldError,
              ]}>
                <Text style={[
                  s.floatLabel,
                  (focused === 'id' || id.length > 0) && s.floatLabelActive,
                ]}>아이디</Text>
                <TextInput
                  style={[
                    s.input,
                    (focused === 'id' || id.length > 0) && s.inputShifted,
                  ]}
                  value={id}
                  onChangeText={t => { setId(t); if (error) setError(''); }}
                  onFocus={() => setFocused('id')}
                  onBlur={() => setFocused(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  textContentType="username"
                  placeholder=""
                />
              </View>

              {/* 비밀번호 */}
              <View style={[
                s.inputField,
                focused === 'pw' && s.inputFieldFocused,
                !!error && s.inputFieldError,
              ]}>
                <Text style={[
                  s.floatLabel,
                  (focused === 'pw' || pw.length > 0) && s.floatLabelActive,
                ]}>비밀번호</Text>
                <TextInput
                  style={[
                    s.input,
                    s.inputPwPad,
                    (focused === 'pw' || pw.length > 0) && s.inputShifted,
                  ]}
                  value={pw}
                  onChangeText={t => { setPw(t); if (error) setError(''); }}
                  onFocus={() => setFocused('pw')}
                  onBlur={() => setFocused(null)}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  textContentType="password"
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPw(v => !v)}
                  activeOpacity={0.6}
                  hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                >
                  <Text style={s.eyeTxt}>{showPw ? '숨김' : '표시'}</Text>
                </TouchableOpacity>
              </View>

              {!!error && (
                <Text style={s.errorTxt}>{error}</Text>
              )}
            </Animated.View>

            {/* Flex spacer — pushes CTA toward thumb zone */}
            <View style={s.spacer} />

            {/* CTA */}
            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.82}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <Text style={[s.submitTxt, !canSubmit && s.submitTxtDisabled]}>
                    로그인
                  </Text>
                )
              }
            </TouchableOpacity>

            {/* Footer helper row */}
            <View style={s.footerRow}>
              <Text style={s.footerText}>로그인에 문제가 있으신가요?</Text>
              <TouchableOpacity
                activeOpacity={0.65}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={s.footerLink}>관리자 문의</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 26,
    paddingBottom: 28,
  },

  // Pushes content ~25% down from the ceiling for visual balance
  topSpacer: {
    flex: 0.18,
    minHeight: 32,
    maxHeight: 72,
  },

  brandWrap: {
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 30,
  },
  brandSub: {
    fontFamily: 'Pretendard-Medium',
    fontSize: 12,
    color: TEXT_500,
    marginTop: 7,
    letterSpacing: -0.2,
  },

  heroWrap: {
    marginBottom: 36,
  },
  hero: {
    fontFamily: 'Pretendard-ExtraBold',
    fontSize: 30,
    lineHeight: 40,
    color: TEXT_900,
    letterSpacing: -1.1,
    marginBottom: 10,
  },
  heroSub: {
    fontFamily: 'Pretendard-Medium',
    fontSize: 15,
    color: TEXT_500,
    letterSpacing: -0.3,
  },

  // Inputs
  inputStack: {
    gap: 10,
  },
  inputField: {
    position: 'relative',
    height: 64,
    backgroundColor: BG_INPUT,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  inputFieldFocused: {
    backgroundColor: '#fff',
    borderColor: TOSS_BLUE,
  },
  inputFieldError: {
    borderColor: DANGER,
  },

  // Floating label — resting state (placeholder position)
  floatLabel: {
    position: 'absolute',
    left: 18,
    top: 22,
    fontFamily: 'Pretendard-Medium',
    fontSize: 15,
    color: TEXT_400,
    letterSpacing: -0.2,
  },
  // Floating label — active state (slides to top)
  floatLabelActive: {
    top: 10,
    fontSize: 11,
    color: TEXT_500,
    fontFamily: 'Pretendard-SemiBold',
    letterSpacing: 0.1,
  },

  input: {
    fontFamily: 'Pretendard-SemiBold',
    fontSize: 16,
    color: TEXT_900,
    paddingHorizontal: 18,
    height: 64,
    letterSpacing: -0.3,
    paddingTop: 0,
    paddingBottom: 0,
  },
  // When label is floating, shift text down to make room
  inputShifted: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  inputPwPad: {
    paddingRight: 72,
  },

  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  eyeTxt: {
    fontFamily: 'Pretendard-SemiBold',
    fontSize: 12,
    color: TEXT_500,
    letterSpacing: -0.1,
  },

  errorTxt: {
    fontFamily: 'Pretendard-Medium',
    fontSize: 13,
    color: DANGER,
    marginTop: 8,
    marginLeft: 4,
    letterSpacing: -0.2,
  },

  spacer: { flex: 1 },

  submitBtn: {
    height: 58,
    borderRadius: 14,
    backgroundColor: TOSS_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  submitBtnDisabled: {
    backgroundColor: BG_INPUT,
  },
  submitTxt: {
    fontFamily: 'Pretendard-Bold',
    fontSize: 17,
    color: '#fff',
    letterSpacing: -0.3,
  },
  submitTxtDisabled: {
    color: '#B0B8C1',
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  footerText: {
    fontFamily: 'Pretendard-Regular',
    fontSize: 13,
    color: TEXT_400,
    letterSpacing: -0.2,
  },
  footerLink: {
    fontFamily: 'Pretendard-SemiBold',
    fontSize: 13,
    color: TEXT_500,
    letterSpacing: -0.2,
    textDecorationLine: 'underline',
  },
});
