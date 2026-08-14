import SurveyApp from "../survey-app";

const routes = [
  ["login"],
  ["auth", "verify"],
  ["dashboard"],
  ["surveys", "12"],
  ["surveys", "12", "preview"],
  ["surveys", "12", "account"],
  ["surveys", "12", "vote"],
  ["surveys", "12", "review"],
  ["surveys", "12", "sign"],
  ["surveys", "12", "success"],
  ["surveys", "12", "document"],
];

export function generateStaticParams() {
  return routes.map((path) => ({ path }));
}

export default function DemoRoute() {
  return <SurveyApp />;
}
