/*
 * Unofficial API for Ray.So that turns your code into beautiful images.
 * Choose from a range of syntax colors, hide or show the background, and
 * toggle between a dark and light window.
 *
 * Source: ray.so
 * Author: github.com/s0ftik3
 */

import puppeteer from 'puppeteer'
import {
    CardPadding,
    CardProgrammingLanguage,
    CardTheme,
} from './entities/options.js'
import { isValidPath } from './helpers/isValidPath.js'
import { InvalidParameterException } from './helpers/exceptions.js';
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto';

export class RaySo {
    /**
     * @param {Object} [options]
            Query parameters to be used to 
            construct the completed request.
        * @param {String} [options.title]
            The title of the code snippet.
            Default is 'Untitled-1'.
        * @param {('breeze'|'candy'|'crimson'|'falcon'|'meadow'|'midnight'|'raindrop'|'sunset')} [options.theme]
            The color scheme you want the
            uploaded code to have.
            Default is breeze.
        * @param {(
            true|
            false
        )} [options.background]
            Hide or show background.
            Default is true.
        * @param {(
            true|
            false
        )} [options.darkMode]
            Will determine whether the background
            behind the text is light or dark.
            Default is true.
        * @param {(
            16|
            32|
            64|
            128
        )} [options.padding]
            Determines the size of the padding
            around the content of the uploaded text.
            Default is 32.
        * @param {String} [options.language]
            The language the code is in.
            Default is auto.
        * @param {(
            true|
            false
        )} [options.debug]
            Will show information in the terminal
            about the image generation process.
            Default is false.
    */
    constructor({
        title = '',
        theme = CardTheme.BREEZE,
        background = true,
        darkMode = true,
        padding = CardPadding.md,
        language = CardProgrammingLanguage.AUTO,
        debug = false
    } = {}) {
        this.title = title
        this.theme = theme
        this.background = background
        this.darkMode = darkMode
        this.padding = padding
        this.language = language
        this.debug = debug
        this.fileName = randomUUID()
    }

    /**
     * This method "cooks" a beautiful image preview of your code.
     * @param {String} code Your code string you want to see in the result image.
     * @public
     * @returns Buffer of the image.
     */
    async cook(code) {
        try {
            const parametersValidation = this.validateParameters({
                title: this.title,
                theme: this.theme,
                background: this.background,
                darkMode: this.darkMode,
                padding: this.padding,
                language: this.language
            })

            if (!parametersValidation.ok)
                throw new InvalidParameterException(
                    `Parameters validation failed.\n\nError message(s): \n${parametersValidation.errors.join('\n')}\n`,
                    parametersValidation.errors
                );

            const browser = await this.openBrowser()
            const page = await this.openPage(browser, code)
            const image = await this.getImage(page)


            await page.close()
            await browser.close()

            return image
        } catch (err) {
            console.error(err.message);
            throw err;
        }
    }

    /**
     * This method opens Chrome browser.
     * @private
     */
    async openBrowser() {
        try {
            const browser = await puppeteer.launch({
                args: [
                    "--proxy-server='direct://'",
                    '--proxy-bypass-list=*',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                ],
                headless: false,
                ignoreHTTPSErrors: true,
            })

            if (this.debug) {
                console.info('[===-------] Opened browser...')
            }

            return browser
        } catch (err) {
            console.error(err)
        }
    }

    /**
     * This method opens new ray.so page.
     * @private
     */
    async openPage(browser, code) {
        try {
            const page = await browser.newPage()

            await page.goto(this.buildPageUrl(code))

            return page
        } catch (err) {
            console.error(err)
        }
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * This method takes a screenshot of the code preview frame and returns an image buffer.
     * @private
     */

    async getImage(page) {
        try {
            // Definir a pasta de downloads
            const downloadPath = path.resolve(
                path.dirname(new URL(import.meta.url).pathname),
                'downloads'
            );
    
            await page._client().send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath,
            });
    
            // Esperar o botão de download aparecer e clicar
            await this.sleep(5000);
            await page.click('button[aria-label="Export as PNG"]');
    
            // Monitorar a pasta de downloads pelo arquivo
            const waitForFile = async (dir, timeout = 10000) => {
                const start = Date.now();
                while (Date.now() - start < timeout) {
                    const files = fs.readdirSync(dir);
                    const pngFile = files.find((file) => file.endsWith('.png')); // Procura apenas arquivos .png
                    if (pngFile) {
                        return path.join(dir, pngFile); // Retorna o caminho do arquivo .png
                    }
                    await new Promise((r) => setTimeout(r, 1000)); // Espera antes de verificar novamente
                }
                throw new Error('File download timed out.');
            };
    
            // Esperar o arquivo ser baixado e renomear
            const downloadedFile = await waitForFile(downloadPath);
            const newFileName = path.join(downloadPath, `${this.fileName}.png`);
            fs.renameSync(downloadedFile, newFileName);
    
            console.log(`File downloaded and renamed to: ${newFileName}`);
    
            // Ler o conteúdo do arquivo
            const fileContent = fs.readFileSync(newFileName);
            
            await this.removeFolder(downloadPath);
    
            return fileContent;
        } catch (err) {
            console.error(err);
        }
    }

    async removeFolder(directory) {
        const files = await fs.promises.readdir(directory);
        for (const file of files) {
            if (path.extname(file) === '.png') {
                await fs.promises.unlink(path.join(directory, file));
            }
        }
    }

    /**
     * This method builds ray.so url with its params based on params passed to the class constructor.
     * @private
     */
    buildPageUrl(code) {
        try {
            return `https://ray.so/#title=${encodeURIComponent(
                this.title
            )}&theme=${this.theme}&padding=${this.padding}&background=${this.background
                }&darkMode=${this.darkMode}&code=${encodeURIComponent(
                    this.stringToBase64(code)
                )}&language=${encodeURIComponent(this.language)}`
        } catch (err) {
            console.error(err)
        }
    }

    /**
     * This method translates string to base64 string. Ray.so accepts only base64 string as code string.
     * @private
     */
    stringToBase64(string) {
        try {
            return Buffer.from(string).toString('base64')
        } catch (err) {
            console.error(err)
        }
    }

    /**
     * This method validates parameters passed to constructor.
     * @private
     */
    validateParameters(params) {
        try {
            if (this.debug) {
                console.info('[=---------] Started image generation...')
            }

            const errors = []

            const themes = Object.values(CardTheme)
            const paddings = Object.values(CardPadding)
            const languages = Object.values(CardProgrammingLanguage)

            if (typeof params.title !== 'string')
                errors.push('Title parameter must be type of string.')

            if (typeof params.background !== 'boolean')
                errors.push('Background parameter must be type of boolean.')

            if (typeof params.darkMode !== 'boolean')
                errors.push('Dark mode parameter must be type of boolean.')

            if (typeof params.theme !== 'string') {
                errors.push('Theme parameter must be type of string.')
            } else if (!themes.includes(params.theme.toLowerCase())) {
                errors.push(
                    'There is no such a theme. Available themes: ' + themes.join(', ')
                )
            }

            if (
                typeof params.padding !== 'string' &&
                typeof params.padding !== 'number'
            ) {
                errors.push(
                    'Padding parameter must be type of string or number.'
                )
            } else if (!paddings.includes(+params.padding)) {
                errors.push('Padding parameter must be 16, 32, 64 or 128.')
            }

            if (typeof params.language !== 'string') {
                errors.push('Language parameter must be type of string.')
            } else if (!languages.includes(params.language.toLowerCase())) {
                errors.push(
                    "There is no such a language. Use 'auto' to define code language automatically."
                )
            }

            if (errors.length > 0) {
                return { ok: false, errors }
            } else {
                if (this.debug) {
                    console.info('[==--------] Passed validation...')
                }
                return { ok: true }
            }
        } catch (err) {
            console.error(err)
        }
    }
}
