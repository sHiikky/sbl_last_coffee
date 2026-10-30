import React, { forwardRef, useContext } from 'react';
import { TextInput as NativeTextInput } from 'react-native';
import { FontReadyContext, resolveTextFace } from './AppText';

const AppTextInput = forwardRef(function AppTextInput({ style, ...props }, ref) {
  const ready = useContext(FontReadyContext);
  return <NativeTextInput {...props} ref={ref} style={[style, resolveTextFace(style, undefined, ready).style]} />;
});
export default AppTextInput;
