import React, { useState, useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Formik } from 'formik';
import validator from 'validator';
import { useAuth } from '../contexts/Auth';
import { Button, Input, Screen } from '../components';
import { Body, BodySmall, Heading3 } from '../components/Typography';
import { useThemeColor } from '../components/Themed';
import CustomerService from '../services/CustomerService';
import { RouteProp } from '@react-navigation/core';
import { RootStackParamList } from '../types';
import { StackNavigationProp } from '@react-navigation/stack';
import config from '../config/config';
import {removeValue} from '../utils/asyncStorage'

const logo = require('../assets/images/logo.png');

interface LoginScreenProps {
    navigation: StackNavigationProp<RootStackParamList, 'Login'>;
    route: RouteProp<RootStackParamList, 'Login'>;
}

interface LoginFields {
    email: string;
    password: string;
}


export default function LoginScreen({ navigation, route }: LoginScreenProps): JSX.Element {
    const {setCustomer, ...auth} = useAuth();

    const [commonError, setCommonError] = useState<string>('');
    
    const initialValues: LoginFields = {
        email: '',
        password: ''
    };

    const allowSignup = config.application.allowSignup === 'true';
    const primary = useThemeColor('primary');

    const styles = StyleSheet.create({
        logo: {
            height: 200,
            width: 200,
            marginTop: -30,
            marginBottom: -25
        },
        message: {
            marginTop: 4,
        },
        commonError: {
            marginTop: 4,
            marginBottom: -20,
        },
        inputContainer: {
            marginTop: 35,
            marginBottom: 30,
        },
        underline: {
            marginTop: 20,
            textDecorationLine: 'underline',
            textDecorationColor: primary,
            color: primary,
        },
        forgotAccount: {
            textDecorationLine: 'underline',
            textDecorationColor: primary,
            color: primary,
            marginTop: 20
        }
    });

    const validateForm = (values: LoginFields): any => {
        const errors: any = {};

        if (validator.isEmpty(values.email, { ignore_whitespace: true })) {
            errors.email = 'Email is required.';
        }
        else if (!validator.isEmail(values.email)) {
            errors.email = 'Invalid email address.';
        }

        if (validator.isEmpty(values.password, { ignore_whitespace: true })) {
            errors.password = 'Password is required.';
        }

        return errors;
    };

  useEffect(() => {
    const fetchCustomer = async () => {
      if (auth.accessToken !== '') {
        try {
          const customer = await CustomerService.getCustomer(auth.accessToken);
          setCustomer(customer);

        } catch(e) {
            removeValue({storageKey: '@tokens'})
        }

      }
    };
    fetchCustomer();
  }, [auth]);

  const onSubmit = async (values: LoginFields): Promise<void> => {
      
        setCommonError('');
        const authData = await auth.login(values.email, values.password);
        
        if(!authData.success) {
            setCommonError(authData.message);
            return;
        }

        if(authData.data.require_new_password) {
            navigation.navigate('SetPassword');
            return;
        }
    };

    const gotoSignupScreen = () => {
        navigation.navigate('Signup');
    };

    const onPressForgotPassword = (): void => {
        navigation.navigate('ForgotPassword');
    };

    return (
        <Screen
            useScrollView
            bounces={false}
        >
            <View style={{
                alignSelf: 'center'
            }}>
                <Image
                    source={logo}
                    resizeMode='contain'
                    resizeMethod='resize'
                    style={styles.logo}
                />
            </View>
            <Heading3 textAlign='center'>Login</Heading3>
            {!!route.params?.message &&
                <BodySmall textAlign='center' style={styles.message}>{route.params.message}</BodySmall>
            }
            {!!commonError &&
                <BodySmall color='error' textAlign='center' style={styles.commonError}>{commonError}</BodySmall>
            }
            <Formik
                initialValues={initialValues}
                onSubmit={onSubmit}
                validate={validateForm}
            >
                {({ handleChange, handleBlur, handleSubmit, values, errors, isValid, isSubmitting, dirty, touched }) => (
                    <>
                        <View style={styles.inputContainer}>
                            <Input
                                label='Email'
                                autoCapitalize={'none'}
                                keyboardType='email-address'
                                textContentType='emailAddress'
                                onChangeText={handleChange('email')}
                                onBlur={handleBlur('email')}
                                value={values.email}
                                errorText={touched.email && errors.email}
                                editable={!isSubmitting}
                                onSubmitEditing={(): void => handleSubmit()}
                            />
                            <Input
                                label='Password'
                                textContentType='password'
                                onChangeText={handleChange('password')}
                                onBlur={handleBlur('password')}
                                value={values.password}
                                secureTextEntry
                                errorText={touched.password && errors.password}
                                editable={!isSubmitting}
                                onSubmitEditing={(): void => handleSubmit()}
                            />
                        </View>
                        <Button
                            title='Login'
                            disabled={!dirty || !isValid || isSubmitting}
                            onPress={(): void => handleSubmit()}
                        />

                        { allowSignup && 
                            <Pressable onPress={(): void => gotoSignupScreen()}>
                                <Body textAlign='center' fontWeight='semibold' style={styles.underline}>
                                    I need to create an account
                                </Body>
                            </Pressable>
                        }
                        <Pressable onPress={(): void => { onPressForgotPassword(); }} disabled={isSubmitting}>
                            <Body textAlign='center' fontWeight='semibold' style={styles.forgotAccount}>Forgot password</Body>
                        </Pressable>
                    </>
                )}
            </Formik>
        </Screen>
    );
}
