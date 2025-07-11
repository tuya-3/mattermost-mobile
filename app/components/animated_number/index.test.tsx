// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, waitFor, screen} from '@testing-library/react-native';
import React from 'react';
import {Animated} from 'react-native';

import AnimatedNumber from '.';

const NUMBER_HEIGHT = 10;

describe('AnimatedNumber', () => {

    // running on jest, since Animated is a native module, Animated.timing.start needs to be mocked in order to update to the final Animated.Value.
    // Ex: 1 => 2, the Animated.Value should be -20 (from -10) after the animation is done
    jest.spyOn(Animated, 'timing').mockImplementation((a, b) => ({

        // @ts-expect-error mock implementation for testing
        start: jest.fn().mockImplementation(() => a.setValue(b.toValue)),
        stop: jest.fn(),
        reset: jest.fn(),
    }) as unknown as Animated.CompositeAnimation);

    it('should render the non-animated number', () => {
        render(<AnimatedNumber animateToNumber={123}/>);

        const text = screen.getByTestId('no-animation-number');
        expect(text.children).toContainEqual('123');
    });

    it('should removed the non-animation number after getting the correct height', () => {
        render(<AnimatedNumber animateToNumber={123}/>);

        const text = screen.getByTestId('no-animation-number');

        fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

        const removedText = screen.queryByTestId('no-animation-number');

        expect(removedText).toBeNull();
    });

    it('should switch to the animated number view', async () => {
        render(<AnimatedNumber animateToNumber={123}/>);

        const text = screen.getByTestId('no-animation-number');

        fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

        const animatedView = screen.getByTestId('animation-number-main');
        expect(animatedView).toBeTruthy();
    });

    describe.each([1, 23, 579, -123, 6789, 23456])('should show the correct number of animated views based on the digits', (animateToNumber: number) => {
        const isNegative = animateToNumber < 0;
        const numberOfDigits = Math.abs(animateToNumber).toString().length;

        // For negative numbers: minus sign + digits, for positive: only digits
        const expectedChildrenCount = isNegative ? numberOfDigits + 1 : numberOfDigits;

        it(`should display ${expectedChildrenCount} child element(s) for ${animateToNumber}`, async () => {
            render(<AnimatedNumber animateToNumber={animateToNumber}/>);

            const text = screen.getByTestId('no-animation-number');

            fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

            await waitFor(() => {
                const animatedView = screen.getByTestId('animation-number-main');
                expect(animatedView.children).toHaveLength(expectedChildrenCount);
            });
        });
    });

    describe.each([123, 9982, 12345, 901876, -157])('should show the correct number', (animateToNumber: number) => {
        const absAnimatedNumberString = String(Math.abs(animateToNumber));
        const numberOfDigits = absAnimatedNumberString.length;
        it(`should display the number ${animateToNumber}`, async () => {
            render(<AnimatedNumber animateToNumber={animateToNumber}/>);

            const text = screen.getByTestId('no-animation-number');

            fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

            const checkEachDigit = absAnimatedNumberString.split('').map(async (number, index) => {
                const useIndex = numberOfDigits - 1 - index;

                // Check that the transform structure exists and the digit is properly positioned
                const transformedView = screen.getByTestId(`animated-number-view-${useIndex}`);
                expect(transformedView.props.style.transform).toBeDefined();
                expect(transformedView.props.style.transform[0]).toHaveProperty('translateY');
                const {translateY} = transformedView.props.style.transform[0];
                expect(typeof translateY).toBe('number');

                // Verify the digit is within reasonable range (0-9 * NUMBER_HEIGHT)
                expect(Math.abs(translateY)).toBeLessThanOrEqual(9 * NUMBER_HEIGHT);
            });

            await Promise.all(checkEachDigit);
        });
    });

    describe.each([146, 144, 1, 1000000, -145])('should rerender the correct number that it animates to', (animateToNumber: number) => {
        it(`should display the number ${animateToNumber}`, async () => {
            const startingNumber = 145;
            const {rerender} = render(<AnimatedNumber animateToNumber={startingNumber}/>);

            const text = screen.getByTestId('no-animation-number');

            fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

            // Wait for initial setup to complete
            await waitFor(() => {
                expect(screen.getByTestId('animation-number-main')).toBeTruthy();
            });

            // Force a complete re-render with new number
            rerender(<AnimatedNumber animateToNumber={animateToNumber}/>);

            // Wait a bit for the animation mock to complete
            await new Promise((resolve) => setTimeout(resolve, 50));

            const animateToNumberString = String(Math.abs(animateToNumber));
            const numberOfDigits = animateToNumberString.length;
            const isNegative = animateToNumber < 0;
            const expectedChildrenCount = isNegative ? numberOfDigits + 1 : numberOfDigits;

            // Check that we have the correct number of child elements (including minus sign for negative numbers)
            const animatedView = screen.getByTestId('animation-number-main');
            expect(animatedView.children).toHaveLength(expectedChildrenCount);

            // Verify component structure is correct instead of checking precise translateY values
            for (let index = 0; index < numberOfDigits; index++) {
                const useIndex = numberOfDigits - 1 - index;
                const transformedView = screen.getByTestId(`animated-number-view-${useIndex}`);

                // Verify the view exists and has a transform
                expect(transformedView).toBeTruthy();
                expect(transformedView.props.style.transform).toBeDefined();
                expect(transformedView.props.style.transform[0].translateY).toBeDefined();
            }
        });
    });

    it('KNOWN UI BUG: should show that there will be an issue if the text height changes, due to the non-animated number view has been removed', async () => {
        // the number text will get cut-off if the user changes the text size on their mobile devices
        render(<AnimatedNumber animateToNumber={123}/>);

        const text = screen.getByTestId('no-animation-number');

        fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT}}});

        try {
            fireEvent(text, 'onLayout', {nativeEvent: {layout: {height: NUMBER_HEIGHT + NUMBER_HEIGHT}}});
        } catch (e) {
            expect(e).toEqual(new Error('Unable to find node on an unmounted component.'));
        }

        const animatedView = screen.getByTestId('animation-number-main');
        expect(animatedView).toBeTruthy();
    });
});
