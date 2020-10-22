'use strict';

const chai = require('chai');
const rewire = require('rewire');
const sinon = require('sinon');
const util = require('util');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const { expect } = chai;

const recycle = rewire('./index');

function testFunctionBuilder(name, {
    isResolved = true,
    result = 'Why hello there',
    delay = 10,
    beforeResolving = () => {},
    afterResolving = () => {}
} = {}) {
    const obj = {
        [name]: () => {
            return new Promise((resolve, reject) => {
                function execute() {
                    beforeResolving();
                    isResolved ? resolve(result) : reject(result);
                    afterResolving();
                }
                if (!delay) {
                    return execute();
                }
                setTimeout(execute, delay);
            });
        }
    };
    return obj[name];
}

function getRegistry() {
    return recycle.__get__('registry');
}

describe('pending-promise-recycler', () => {

    afterEach(() => {
        sinon.restore();
    });

    describe('Basic usage', () => {

        it('Executes a promise function once', async () => {
            function beforeResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).to.be.a('promise');
                expect(util.format('%s', p)).to.be.equal('Promise { <pending> }');
            }
            function afterResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).to.be.a('promise');
                expect(util.format('%s', p)).to.be.equal('Promise { \'Why hello there\' }');
            }
            const spy = sinon.spy(testFunctionBuilder('a', { beforeResolving, afterResolving }));
            const cachedFunc = recycle(spy);
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(getRegistry()).to.be.empty;
            expect(spy).to.be.calledOnceWithExactly('lorem', 'ipsum', 'dolor sit amet');
            expect(result).to.equal('Why hello there');
        });

        it('Executes a fulfilled promise function twice, recycling the promise itself', async () => {
            const registry = getRegistry();
            const registryGetSpy = sinon.spy(registry, 'get');
            const func = testFunctionBuilder('a');
            const funcSpy = sinon.spy(func);
            const cachedFunc = recycle(funcSpy);
            const [promiseA, promiseB] = await Promise.all([
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(registryGetSpy).to.be.calledOnce;
            expect(funcSpy).to.be.calledOnce;
            expect(registry).to.be.empty;
            expect(promiseA).to.equal('Why hello there');
            expect(promiseB).to.equal('Why hello there');
        });

        it('Executes a rejected promise function twice, recycling the promise itself', async () => {
            const registry = getRegistry();
            const registryGetSpy = sinon.spy(registry, 'get');
            const func = testFunctionBuilder('a', { isResolved: false });
            const funcSpy = sinon.spy(func);
            const cachedFunc = recycle(funcSpy);
            const [promiseA, promiseB] = await Promise.allSettled([
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(registryGetSpy).to.be.calledOnce;
            expect(funcSpy).to.be.calledOnce;
            expect(registry).to.be.empty;
            expect(promiseA).to.have.property('status', 'rejected');
            expect(promiseA).to.have.property('reason', 'Why hello there');
            expect(promiseB).to.have.property('status', 'rejected');
            expect(promiseB).to.have.property('reason', 'Why hello there');
        });
    });

    describe('Error handling', () => {

        it('Handles rejected promises, making sure the registry stays clean', async () => {
            function beforeResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).to.be.a('promise');
                expect(util.format('%s', p)).to.be.equal('Promise { <pending> }');
            }
            function afterResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).to.be.a('promise');
            }
            const spy = sinon.spy(testFunctionBuilder('a', {
                isResolved: false,
                result: new Error('Ruh-roh'),
                beforeResolving,
                afterResolving
            }));
            const cachedFunc = recycle(spy);
            const error = await expect(cachedFunc('lorem', 'ipsum', 'dolor sit amet')).to.be.rejected;
            expect(getRegistry()).to.be.empty;
            expect(spy).to.be.calledOnceWithExactly('lorem', 'ipsum', 'dolor sit amet');
            expect(error).to.be.an('error').and.have.property('message', 'Ruh-roh');
        });
    });

    describe('Key builders', () => {

        it('Supports custom key builder functions', async () => {
            function beforeResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('lorem');
            }
            const spy = sinon.spy(testFunctionBuilder('a', { beforeResolving }));
            const cachedFunc = recycle(spy, {
                keyBuilder: (func, ...args) => {
                    return args[0];
                }
            });
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(getRegistry()).to.be.empty;
            expect(spy).to.be.calledOnceWithExactly('lorem', 'ipsum', 'dolor sit amet');
            expect(result).to.equal('Why hello there');
        });

        it('Supports a fixed key value', async () => {
            function beforeResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys('toothbrush');
            }
            const spy = sinon.spy(testFunctionBuilder('a', { beforeResolving }));
            const cachedFunc = recycle(spy, { keyBuilder: 'toothbrush' });
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(getRegistry()).to.be.empty;
            expect(spy).to.be.calledOnceWithExactly('lorem', 'ipsum', 'dolor sit amet');
            expect(result).to.equal('Why hello there');
        });

        it('Works with anonymous functions', async () => {
            function beforeResolving() {
                const registry = getRegistry();
                expect(registry).to.have.keys(
                    'anonymous-0d0491105dd08721e0911939ca184e9e5a6f924b00dce27a4163ca333049bf20'
                );
            }
            const spy = sinon.spy(testFunctionBuilder('', { beforeResolving }));
            const cachedFunc = recycle(spy);
            const result = await cachedFunc('lorem');
            expect(getRegistry()).to.be.empty;
            expect(spy).to.be.calledOnceWithExactly('lorem');
            expect(result).to.equal('Why hello there');
        });
    });

    describe('Error handling', () => {

        it('Handles promises that cause a TypeError', async () => {
            const func = () => {
                return new Promise(resolve => {
                    const hmmm = ''[0][0];
                    resolve(hmmm);
                });
            };
            const spy = sinon.spy(func);
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).to.be.rejected;
            expect(getRegistry()).to.be.empty;
        });

        it('Handles promises that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = () => {
                return new Promise(() => {
                    throw err;
                });
            };
            const spy = sinon.spy(func);
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).to.be.rejectedWith(err);
            expect(getRegistry()).to.be.empty;
        });

        it('Handles async functions that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = async () => {
                throw err;
            };
            const spy = sinon.spy(func);
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).to.be.rejectedWith(err);
            expect(getRegistry()).to.be.empty;
        });
    });
});
