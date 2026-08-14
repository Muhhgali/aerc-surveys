import SurveyApp from "../survey-app";

const routes = [
  ["login"],
  ["auth", "verify"],
  ["dashboard"],
  ["archive"],
  ["archive", "8"],
  ["archive", "5"],
  ["surveys", "12"],
  ["surveys", "12", "preview"],
  ["surveys", "12", "account"],
  ["surveys", "12", "vote"],
  ["surveys", "12", "review"],
  ["surveys", "12", "sign"],
  ["surveys", "12", "success"],
  ["surveys", "12", "document"],
  ["surveys", "13"],
  ["surveys", "13", "preview"],
  ["surveys", "13", "account"],
  ["surveys", "13", "vote"],
  ["surveys", "13", "review"],
  ["surveys", "13", "sign"],
  ["surveys", "13", "success"],
  ["surveys", "13", "document"],
  ["surveys", "14"],
  ["surveys", "14", "preview"],
];

export function generateStaticParams() {
  return routes.map((path) => ({ path }));
}

export default function DemoRoute() {
  return <SurveyApp />;
}
