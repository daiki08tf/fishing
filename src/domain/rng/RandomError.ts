/** Domain の乱数利用で発生し得るエラー。 */
export class RandomError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RandomError'
  }
}

/** int(min, max) に不正な範囲が渡された。 */
export class InvalidRandomRangeError extends RandomError {
  constructor(min: number, max: number) {
    super(`Invalid random range: min=${String(min)} max=${String(max)}`)
    this.name = 'InvalidRandomRangeError'
  }
}

/** pick() に空配列が渡された。 */
export class EmptyPickError extends RandomError {
  constructor() {
    super('Cannot pick from an empty collection')
    this.name = 'EmptyPickError'
  }
}
