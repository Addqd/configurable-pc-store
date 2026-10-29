import whyChooseUsImage from '../assets/home/home-why-choose-us.png'

export function WhyChooseUs() {
  return (
    <div className="w-full py-8">
      <img
        src={whyChooseUsImage}
        alt="Почему выбирают нас: Гарантия качества, Быстрая доставка, Экспертная поддержка, Выгодные цены, Конфигуратор ПК, Редкие комплектующие, Готовые сборки"
        className="w-full h-auto max-w-full object-contain"
      />
    </div>
  )
}
