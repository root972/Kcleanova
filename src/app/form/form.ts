import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-form',
  standalone: false,
  templateUrl: './form.html',
  styleUrl: './form.css',
})
export class Form {

  // form fields
  name = '';
  email = '';
  password = '';
  city = '';

  // city autocomplete
  cityResults: string[] = [];
  showDropdown = false;

  constructor(private http: HttpClient) {}

  onCityInput() {
    if (this.city.length < 3) {
      this.cityResults = [];
      this.showDropdown = false;
      return;
    }


    this.http.get<any>(
  `https://nominatim.openstreetmap.org/search?city=${this.city}&format=json&limit=5`
).subscribe(response => {
  this.cityResults = response.map((c: any) => c.display_name);
  this.showDropdown = true;
});
}

  selectCity(cityName: string) {
    this.city = cityName;
    this.showDropdown = false;
    this.cityResults = [];
  }

  onSubmit() {
  this.http.post('http://localhost:3000/submit', {
    name: this.name,
    email: this.email,
    password: this.password,
    city: this.city
  }).subscribe((response: any) => {
    console.log('Saved!', response);
    alert('User saved successfully!');
  });
}
}